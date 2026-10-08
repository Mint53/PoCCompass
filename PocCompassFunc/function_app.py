"""Azure Functions entry point. Routing lives in app/api.py; this file only binds triggers."""

import logging
import os
import sys

import azure.functions as func

from app.api import app as fastapi_app

logging.info("PoC Compass worker python=%s", sys.executable)

app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.FUNCTION)


if os.environ.get("DISABLE_TIMER", "").lower() != "true":

    # SPEC §6: daily 06:00 JST
    @app.timer_trigger(schedule="0 0 21 * * *", arg_name="timer", run_on_startup=False, use_monitor=True)
    def daily_evaluation(timer: func.TimerRequest) -> None:
        from app.services.context import default_repos
        from app.services.evaluation_service import run_scheduled
        from app.services.llm_client import get_llm

        result = run_scheduled(default_repos(), get_llm)
        logging.info("daily_evaluation result=%s past_due=%s", result, timer.past_due)
