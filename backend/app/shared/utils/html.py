import nh3

ALLOWED_TAGS = {
    "h2", "h3", "h4", "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "img", "span",
}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "ol": {"start"},
    **{tag: {"style"} for tag in ("p", "h2", "h3", "h4")},
}

ALLOWED_TAG_ATTRIBUTE_VALUES = {"a": {"target": {"_blank", "_self"}}}
ALLOWED_STYLE_PROPERTIES = {"text-align"}
URL_SCHEMES = {"http", "https", "mailto", "tel"}
LINK_REL = "noopener noreferrer nofollow"


def clean_html(value: str | None) -> str | None:
    if not value:
        return value
    return nh3.clean(
        value,
        tags=ALLOWED_TAGS,
        clean_content_tags={"script", "style"},
        attributes=ALLOWED_ATTRIBUTES,
        tag_attribute_values=ALLOWED_TAG_ATTRIBUTE_VALUES,
        filter_style_properties=ALLOWED_STYLE_PROPERTIES,
        url_schemes=URL_SCHEMES,
        link_rel=LINK_REL,
        strip_comments=True,
    )
