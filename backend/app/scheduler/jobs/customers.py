from datetime import timedelta

from sqlalchemy.orm import Session

from app.shared.utils.datetime import now

NAME = "customers"
DESCRIPTION = "Removes expired sign-in codes, ended customer sessions and SMS logs older than 90 days."
CADENCE = "hourly"
SCHEDULE = "45 * * * *"
SMS_LOG_DAYS = 90


def run(db: Session, force: bool = False) -> str:
    from app.modules.admin.sms.models import SmsLog
    from app.modules.customer.account.models import CustomerOtp, CustomerSession

    current = now()
    otps = db.query(CustomerOtp).filter(CustomerOtp.expires_at < current - timedelta(days=1)) \
        .delete(synchronize_session=False)
    sessions = db.query(CustomerSession).filter(
        (CustomerSession.expires_at < current) | (CustomerSession.revoked_at < current - timedelta(days=30))
    ).delete(synchronize_session=False)
    logs = db.query(SmsLog).filter(SmsLog.created_at < current - timedelta(days=SMS_LOG_DAYS)) \
        .delete(synchronize_session=False)
    db.commit()
    return f"removed {otps} old codes, {sessions} ended sessions, {logs} SMS logs"
