"""Test configuration — make sure the motor client runs on the pytest event loop."""
import sys
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def _bind_motor_to_test_loop():
    """
    Motor's AsyncIOMotorClient is created at module import time on whichever loop
    happens to be running. Under pytest-asyncio it's not our test loop, so we
    recreate the client bound to the current loop before tests run.
    """
    import server
    from motor.motor_asyncio import AsyncIOMotorClient
    server.client = AsyncIOMotorClient(server.mongo_url)
    server.db = server.client[server.db_name]
    yield
    server.client.close()
