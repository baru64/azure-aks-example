import os
from datetime import datetime, timezone

from . import models
from .database import SessionLocal

INDEX = int(os.environ['JOB_COMPLETION_INDEX']) + 1


def main():
    with SessionLocal as db:
        item = db.query(models.Item).get(INDEX)
        item.desciption = datetime.now(tz=timezone.utc).isoformat()
        db.add(item)
        db.commit()


if __name__ == "__main__":
    main()
