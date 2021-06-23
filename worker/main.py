# import os
from datetime import datetime, timezone

from . import models
from .database import SessionLocal

# no indexed jobs in kubernetes v1.19
# INDEX = int(os.environ['JOB_COMPLETION_INDEX'])


def main():
    with SessionLocal() as db:
        items = db.query(models.Item).all()
        # item = items[INDEX]
        for item in items:
            item.description = datetime.now(tz=timezone.utc).isoformat()
            db.add(item)
        db.commit()


if __name__ == "__main__":
    main()
