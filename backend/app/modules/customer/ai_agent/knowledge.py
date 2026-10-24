"""What an agent knows: reading files and web pages once, cutting them into passages, and finding the
passages that answer a question.

Files are read when they're added (the text is kept, the file stays for the preview) and cut into
passages when the agent is trained. Search is a BM25 index built from those passages once per
training and kept in memory, so answering never re-reads a document.
"""

import csv
import hashlib
import io
import math
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, OrderedDict
from html.parser import HTMLParser

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_SOURCE_CHARS = 400_000  # ~100k tokens; more than any one document a support agent needs
MAX_PAGE_BYTES = 3 * 1024 * 1024
FILE_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
}
CHUNK_TARGET = 900  # characters (~225 tokens): small enough to send only what matters
CHUNK_MAX = 1400


class ReadError(Exception):
    pass


def tokens(text: str) -> int:
    """A quick estimate: ~4 characters per token for English, fewer for other scripts."""
    if not text:
        return 0
    other = sum(1 for ch in text if ord(ch) > 127)
    return max(1, round((len(text) - other) / 4 + other / 1.6))


def _clean(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            text = content.decode(encoding)
            if encoding == "utf-16" and not content.startswith((b"\xff\xfe", b"\xfe\xff")):
                raise UnicodeDecodeError(encoding, b"", 0, 1, "no bom")
            return text
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1")


# Reading ------------------------------------------------------------------------------------

def _pdf(content: bytes) -> tuple[str, int]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted and not reader.decrypt(""):
            raise ReadError("This PDF is password-protected. Remove the password and upload it again.")
        pages = []
        for number, page in enumerate(reader.pages, 1):
            text = _clean(page.extract_text() or "")
            if text:
                pages.append(f"[Page {number}]\n{text}")
    except PdfReadError as exc:
        raise ReadError("This PDF couldn't be opened. It may be damaged.") from exc
    if not pages:
        raise ReadError("No text found in this PDF. It looks like scanned images; upload a PDF with real text "
                        "or paste the text as a note.")
    return "\n\n".join(pages), len(reader.pages)


def _docx(content: bytes) -> str:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        document = docx.Document(io.BytesIO(content))
    except Exception as exc:  # noqa: BLE001 - python-docx raises several kinds for a bad file
        raise ReadError("This Word file couldn't be opened. Save it as .docx and try again.") from exc
    lines: list[str] = []
    for block in document.element.body.iterchildren():
        tag = block.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(block, document)
            text = p.text.strip()
            if not text:
                continue
            style = (p.style.name or "").lower() if p.style is not None else ""
            if style.startswith("heading") or style == "title":
                level = re.sub(r"\D", "", style) or "1"
                lines.append(f"\n{'#' * min(int(level), 3)} {text}")
            elif "list" in style:
                lines.append(f"- {text}")
            else:
                lines.append(text)
        elif tag == "tbl":
            for row in Table(block, document).rows:
                cells = [c.text.strip() for c in row.cells]
                cells = [c for i, c in enumerate(cells) if c and (i == 0 or c != cells[i - 1])]  # merged cells
                if cells:
                    lines.append(" | ".join(cells))
            lines.append("")
    return "\n".join(lines)


def _rows(header: list[str], rows) -> list[str]:
    """Table rows as "Column: value; ..." lines, which read well for prices, products and timings."""
    out = []
    names = [h.strip() or f"Column {i + 1}" for i, h in enumerate(header)]
    for row in rows:
        values = ["" if v is None else str(v).strip() for v in row]
        pairs = [f"{names[i] if i < len(names) else f'Column {i + 1}'}: {v}" for i, v in enumerate(values) if v]
        if pairs:
            out.append("; ".join(pairs))
    return out


def _xlsx(content: bytes) -> str:
    import openpyxl

    try:
        book = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001
        raise ReadError("This Excel file couldn't be opened. Save it as .xlsx and try again.") from exc
    parts = []
    for sheet in book.worksheets:
        rows = sheet.iter_rows(values_only=True, max_row=5001)
        header = next(rows, None)
        if not header:
            continue
        lines = _rows(["" if h is None else str(h) for h in header], rows)
        if lines:
            parts.append(f"## {sheet.title}\n" + "\n".join(lines))
    book.close()
    return "\n\n".join(parts)


def _csv(content: bytes) -> str:
    text = _decode(content)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    header = next(reader, None) or []
    return "\n".join(_rows(header, (r for i, r in enumerate(reader) if i < 5000)))


class _Html(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "head", "nav", "footer", "form"}
    BLOCK = {"p", "div", "section", "article", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6", "table",
             "ul", "ol", "header", "main", "aside", "dd", "dt", "blockquote"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.title = ""
        self._in_title = False
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        if tag in self.SKIP:
            self.skip += 1
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        if tag in self.BLOCK:
            self.out.append("\n")
        if tag in ("h1", "h2", "h3") and not self.skip:
            self.out.append("#" * int(tag[1]) + " ")
        if tag == "li" and not self.skip:
            self.out.append("- ")
        if tag in ("td", "th"):
            self.out.append(" | ")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self.skip:
            self.out.append(data)


def html_text(html: str) -> tuple[str, str, list[str]]:
    """(title, readable text, links) of a web page."""
    parser = _Html()
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001 - broken markup still gives what was read so far
        pass
    text = "".join(parser.out)
    text = "\n".join(line.strip(" |") for line in text.split("\n"))
    return " ".join(parser.title.split())[:300], _clean(text), parser.links


def read_file(filename: str, content: bytes) -> dict:
    """{"text", "pages"} read from an uploaded file; ReadError when it can't be used."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in FILE_TYPES:
        raise ReadError("Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text, Markdown or HTML file.")
    if len(content) > MAX_FILE_BYTES:
        raise ReadError("Files can be up to 10 MB.")
    if not content:
        raise ReadError("This file is empty.")
    pages = None
    if ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise ReadError("This file isn't a real PDF.")
        text, pages = _pdf(content)
    elif ext == ".docx":
        text = _docx(content)
    elif ext == ".xlsx":
        text = _xlsx(content)
    elif ext == ".csv":
        text = _csv(content)
    elif ext in (".html", ".htm"):
        _, text, _ = html_text(_decode(content))
    else:
        text = _decode(content)
    text = _clean(text)
    if not text:
        raise ReadError("No text found in this file.")
    if len(text) > MAX_SOURCE_CHARS:
        raise ReadError("This file has too much text (over ~100,000 tokens). Split it into smaller files.")
    return {"text": text, "pages": pages}


def fetch_page(url: str) -> dict:
    """{"url", "title", "text", "links"} of a public web page (redirects followed, each one checked)."""
    from app.modules.customer.ai_agent.providers import address_allowed
    from app.modules.customer.chatbots.engine import _NoRedirect, _public

    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(4):
        if not (_public(url) or address_allowed(url)):
            raise ReadError("Only public website addresses can be added.")
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; ChatDeskBot/1.0; +https://chatdesk.app)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        })
        try:
            with opener.open(req, timeout=12) as res:
                status, content = res.status, res.read(MAX_PAGE_BYTES)
                kind = res.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308) and exc.headers.get("Location"):
                url = urllib.parse.urljoin(url, exc.headers["Location"])
                continue
            raise ReadError(f"The website answered {exc.code}. Check the address.") from exc
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise ReadError("Couldn't open this website. Check the address and try again.") from exc
        break
    else:
        raise ReadError("The website redirected too many times.")
    if status >= 400:
        raise ReadError(f"The website answered {status}.")
    if "pdf" in kind:
        text, _ = _pdf(content)
        return {"url": url, "title": url.rsplit("/", 1)[-1] or url, "text": text, "links": []}
    raw = content.decode("utf-8", "replace")
    if "html" in kind or "<html" in raw[:2000].lower():
        title, text, links = html_text(raw)
    else:
        title, text, links = "", _clean(raw), []
    if len(text) < 40:
        raise ReadError("This page has almost no text (it may be built with JavaScript only). "
                        "Paste its text as a note instead.")
    return {"url": url, "title": title or urllib.parse.urlsplit(url).netloc, "text": text[:MAX_SOURCE_CHARS],
            "links": links}


def site_links(base: str, links: list[str], limit: int) -> list[str]:
    """Other pages of the same website found on a page (for "add the whole site")."""
    root = urllib.parse.urlsplit(base)
    seen, out = {base.split("#")[0].rstrip("/")}, []
    for href in links:
        url = urllib.parse.urljoin(base, href).split("#")[0]
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https") or parts.netloc != root.netloc:
            continue
        if re.search(r"\.(jpe?g|png|gif|webp|svg|zip|mp4|mp3|css|js|xml|ico)$", parts.path, re.I):
            continue
        if re.search(r"/(login|signin|signup|register|cart|checkout|account|wp-admin|feed)\b", parts.path, re.I):
            continue
        key = url.rstrip("/")
        if key not in seen:
            seen.add(key)
            out.append(url)
        if len(out) >= limit:
            break
    return out


# Passages ---------------------------------------------------------------------------------------

_HEADING = re.compile(r"^(#{1,3} .+|\[Page \d+\])$")


def chunk(text: str) -> list[tuple[str | None, str]]:
    """(heading, passage) pieces of about CHUNK_TARGET characters, cut at paragraph and sentence ends.
    Each passage repeats the last sentence of the one before so an answer split across them survives."""
    sections: list[tuple[str | None, list[str]]] = [(None, [])]
    for para in re.split(r"\n\s*\n|\n(?=#{1,3} |\[Page \d+\])", text):
        para = para.strip()
        if not para:
            continue
        first, _, rest = para.partition("\n")
        if _HEADING.match(first):
            sections.append((first.lstrip("# ").strip("[]"), []))
            para = rest.strip()
            if not para:
                continue
        sections[-1][1].append(para)

    out: list[tuple[str | None, str]] = []
    for heading, paras in sections:
        pieces: list[str] = []
        for para in paras:
            if len(para) <= CHUNK_MAX:
                pieces.append(para)
                continue
            sentence_buf = ""
            for sentence in re.split(r"(?<=[.!?।])\s+|\n", para):
                if len(sentence_buf) + len(sentence) > CHUNK_TARGET and sentence_buf:
                    pieces.append(sentence_buf.strip())
                    sentence_buf = ""
                while len(sentence) > CHUNK_MAX:  # one enormous line (a table dump, minified text)
                    pieces.append(sentence[:CHUNK_MAX])
                    sentence = sentence[CHUNK_MAX:]
                sentence_buf += " " + sentence
            if sentence_buf.strip():
                pieces.append(sentence_buf.strip())
        buf, carry = "", ""
        for piece in pieces:
            if buf and len(buf) + len(piece) > CHUNK_TARGET:
                out.append((heading, buf.strip()))
                last = re.split(r"(?<=[.!?।])\s+", buf.strip())[-1]
                carry = last if len(last) < 300 else ""
                buf = (carry + "\n" if carry else "")
            buf += piece + "\n"
        if buf.strip() and buf.strip() != carry:
            out.append((heading, buf.strip()))
    return out


# Search -------------------------------------------------------------------------------------------

_STOP = set("""a an the and or but if of to in on at by for with from as is are was were be been being it its
this that these those i me my we our you your he she they them their what which who whom how when where why
do does did done can could will would shall should may might must have has had not no yes please hi hello hey
thanks thank ok okay about any some there here than then so very just also into out up down over get got
kya hai hain ka ki ke ko me mein se aur bhi ye yeh wo woh kaise kab kahan kitna kitne kitni h ho hota hoti
mujhe hum aap tum batao bataiye bata chahiye""".split())


def terms(text: str) -> list[str]:
    out = []
    for word in re.findall(r"\w+", text.lower()):
        if word in _STOP or (len(word) < 2 and not word.isdigit()):
            continue
        if word.isascii() and len(word) > 4:  # light stemming: rooms/room, booking/book, charges/charge
            for suffix in ("ing", "ies", "es", "ed", "ly", "s"):
                if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                    word = word[: -len(suffix)] + ("y" if suffix == "ies" else "")
                    break
        out.append(word)
    return out


class Index:
    """BM25 over an agent's passages."""

    K1, B = 1.4, 0.75

    def __init__(self, passages: list[dict]):
        self.passages = passages
        self.tf = [Counter(terms(f"{p.get('title') or ''} {p.get('heading') or ''} {p['text']}")) for p in passages]
        self.lengths = [sum(c.values()) for c in self.tf]
        self.avg = (sum(self.lengths) / len(self.lengths)) if self.lengths else 1
        df: Counter = Counter()
        for c in self.tf:
            df.update(c.keys())
        n = len(passages)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, limit: int = 6) -> list[tuple[float, dict]]:
        q = Counter(terms(query))
        if not q or not self.passages:
            return []
        scored = []
        for i, tf in enumerate(self.tf):
            score = 0.0
            for term, weight in q.items():
                f = tf.get(term)
                if not f:
                    continue
                norm = self.K1 * (1 - self.B + self.B * self.lengths[i] / self.avg)
                score += self.idf.get(term, 0) * f * (self.K1 + 1) / (f + norm) * (1 + 0.3 * (weight - 1))
            if score > 0:
                scored.append((score, i))
        scored.sort(reverse=True)
        return [(s, self.passages[i]) for s, i in scored[:limit]]


_indexes: "OrderedDict[tuple[int, int], Index]" = OrderedDict()
_lock = threading.Lock()


def index_for(agent_id: int, version: int, load) -> Index:
    """The agent's search index for this training, built once (`load()` returns the passages)."""
    key = (agent_id, version)
    with _lock:
        if key in _indexes:
            _indexes.move_to_end(key)
            return _indexes[key]
    built = Index(load())
    with _lock:
        _indexes[key] = built
        for old in [k for k in _indexes if k[0] == agent_id and k != key]:
            _indexes.pop(old, None)
        while len(_indexes) > 64:
            _indexes.popitem(last=False)
    return built


def question_key(text: str) -> str:
    """Same question, same key: "What are your timings?" == "what are your timings" """
    normal = " ".join(re.findall(r"\w+", text.lower()))
    return hashlib.sha256(normal.encode()).hexdigest()
