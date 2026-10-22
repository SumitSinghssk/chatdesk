FIELDS = ("subject", "heading", "body", "button", "note")

LIMITS = {"subject": 200, "heading": 200, "body": 5000, "button": 60, "note": 2000}

GROUPS = {
    "account": "Sign-in & passwords",
    "two_factor": "Two-factor sign-in",
    "enquiries": "Enquiries",
}

DESIGN_DEFAULTS = {
    "accent": "#4f46e5",
    "footer": "This is an automatic message.",
    "show_logo": True,
}

COMMON: dict[str, tuple[str, str | None]] = {
    "name": ("Full name of the person", "Priya Sharma"),
    "first_name": ("First name", "Priya"),
    "email": ("Their email address", "priya@example.com"),
    "app_name": ("Website name", None),
    "site_url": ("Website address", None),
}

DEVICE: dict[str, tuple[str, str | None]] = {
    "when": ("Date and time it happened", None),
    "device": ("Browser and system", "Chrome on Windows"),
    "ip": ("IP address", "203.0.113.24"),
}


def _two_factor(label: str, description: str, heading: str, text: str, warn: bool) -> dict:
    return {
        "group": "two_factor",
        "label": label,
        "description": description,
        "optional": True,
        "fields": ["subject", "heading", "body", "note"],
        "placeholders": {**COMMON, **DEVICE, "done_by": ("Admin who did it (if any)", "Rahul Verma")},
        "defaults": {
            "subject": f"{heading} · {{app_name}}",
            "heading": heading,
            "body": f"Hi {{first_name}}, {text}",
            "note": "Wasn't you? Change your password straight away and tell your site administrator." if warn else "",
        },
        "warn": warn,
    }


DEFINITIONS: dict[str, dict] = {
    "password_reset": {
        "group": "account",
        "label": "Password reset link",
        "description": "Sent when someone uses “Forgot password” on the admin sign-in page.",
        "optional": False,
        "fields": ["subject", "heading", "body", "button", "note"],
        "placeholders": {
            **COMMON,
            **{k: v for k, v in DEVICE.items() if k != "when"},
            "minutes": ("Minutes before the link expires", "60"),
        },
        "defaults": {
            "subject": "Reset your {app_name} password",
            "heading": "Reset your password",
            "body": "Hi {first_name}, someone asked to reset the password for your {app_name} admin account "
                    "({email}). Click the button to choose a new one.",
            "button": "Choose a new password",
            "note": "The link works once and expires in {minutes} minutes.\n\nDidn't ask for this? You can ignore "
                    "this email. Your password stays the same until someone uses the link.",
        },
        "warn": False,
    },
    "password_changed": {
        "group": "account",
        "label": "Password changed",
        "description": "Confirms a password change and warns the owner in case it was not them.",
        "optional": True,
        "fields": ["subject", "heading", "body", "note"],
        "placeholders": {**COMMON, **DEVICE},
        "defaults": {
            "subject": "Your {app_name} password was changed",
            "heading": "Your password was changed",
            "body": "Hi {first_name}, the password for your {app_name} admin account ({email}) was just changed. "
                    "For safety, you were signed out on your other devices.",
            "note": "Wasn't you? Reset your password again straight away and tell your site administrator.",
        },
        "warn": True,
    },
    "account_locked": {
        "group": "account",
        "label": "Account locked",
        "description": "Sent when an account is locked after too many failed sign-in attempts.",
        "optional": True,
        "fields": ["subject", "heading", "body", "button", "note"],
        "placeholders": {
            **COMMON,
            **DEVICE,
            "failures": ("Number of failed attempts", "5"),
            "unlock_info": ("When it unlocks, as a sentence", None),
        },
        "defaults": {
            "subject": "Your {app_name} account was locked",
            "heading": "Your account was locked",
            "body": "Hi {first_name}, there were {failures} failed attempts to sign in to your {app_name} admin "
                    "account ({email}), so we locked it to keep it safe. {unlock_info}",
            "button": "Reset my password",
            "note": "Resetting your password unlocks the account straight away.\n\nIf it wasn't you, someone may be "
                    "guessing your password, so choose a strong new one.",
        },
        "warn": False,
    },
    "two_factor_enabled": _two_factor(
        "Two-factor turned on", "Sent when someone sets up two-factor sign-in.", "Two-factor sign-in is on",
        "two-factor sign-in was turned on for your account. From now on you need a code from your authenticator "
        "app when you sign in.", False),
    "two_factor_changed": _two_factor(
        "Two-factor recovery codes changed", "Sent when someone generates new two-factor recovery codes.",
        "New recovery codes were created",
        "new two-factor recovery codes were created for your account. Your old recovery codes no longer work.",
        True),
    "two_factor_disabled": _two_factor(
        "Two-factor turned off", "Sent when someone turns off their own two-factor sign-in.",
        "Two-factor sign-in was turned off",
        "two-factor sign-in was turned off for your account. Only your password is needed to sign in now.", True),
    "two_factor_reset": _two_factor(
        "Two-factor reset by an admin", "Sent when an administrator resets someone’s two-factor sign-in.",
        "Your two-factor sign-in was reset",
        "an administrator reset two-factor sign-in on your account. You can set it up again with your "
        "authenticator app.", True),
    "two_factor_recovery": _two_factor(
        "Recovery code used", "Sent when someone signs in with a recovery code.", "A recovery code was used",
        "someone signed in to your account with one of your recovery codes instead of a code from your app. Each "
        "recovery code works only once.", True),
    "enquiry_reply": {
        "group": "enquiries",
        "label": "Enquiry reply",
        "description": "The starting text when you reply to an enquiry. You can still change it before each reply.",
        "optional": False,
        "fields": ["subject", "body", "note"],
        "placeholders": {
            **COMMON,
            "enquiry_subject": ("Subject of the enquiry", "Question about pricing"),
            "reference": ("Enquiry reference", "ENQ-000042"),
            "sender_name": ("Your name (the admin replying)", None),
        },
        "defaults": {
            "subject": "Re: {enquiry_subject}",
            "body": "Hi {first_name},\n\n\n\nBest regards,\n{sender_name}\n{app_name}",
            "note": "Reply to this email to answer {sender_name} directly. Reference {reference}.",
        },
        "warn": False,
    },
}

FIELD_HINTS = {
    "subject": "What people see in their inbox.",
    "heading": "Big title at the top of the email. Leave empty to hide it.",
    "body": "Leave an empty line between paragraphs. Put **stars** around words to make them bold. "
            "Web addresses become links.",
    "button": "The button opens the right page by itself.",
    "note": "Smaller text under the details. Leave empty to hide it.",
}

REPLY_HINTS = {
    "body": "Plain text, sent exactly as typed. The empty lines in the middle are where you write each reply.",
    "note": "The line at the very bottom of the reply. Leave empty to use the footer line from Email look.",
}
