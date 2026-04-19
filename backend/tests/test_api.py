"""
TestCapture AI Backend API Tests
Tests: health, root, generate-script, sessions CRUD
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API_URL = f"{BASE_URL}/api"

# Demo session for testing generate-script
DEMO_SESSION = {
    "id": "test-session-1",
    "name": "Test Login Flow",
    "project": "test",
    "status": "saved",
    "startTime": 1700000000000,
    "targetOrigin": "https://demo.todoapp.com",
    "selectedFramework": "playwright",
    "steps": [
        {
            "id": "s1",
            "stepNumber": 1,
            "type": "navigate",
            "label": "Navigate to https://demo.todoapp.com",
            "timestamp": 1700000000000,
            "selector": {"strategy": "url", "value": "https://demo.todoapp.com", "stability": "high"},
            "value": "https://demo.todoapp.com",
            "elementProps": {},
            "url": "https://demo.todoapp.com"
        },
        {
            "id": "s2",
            "stepNumber": 2,
            "type": "click",
            "label": "Click Sign In",
            "timestamp": 1700000001000,
            "selector": {"strategy": "data-testid", "value": "signin-btn", "stability": "high"},
            "elementProps": {"tagName": "BUTTON", "text": "Sign In"},
            "url": "https://demo.todoapp.com"
        },
        {
            "id": "s3",
            "stepNumber": 3,
            "type": "type",
            "label": "Type into Email",
            "timestamp": 1700000002000,
            "selector": {"strategy": "aria-label", "value": "Email", "stability": "high"},
            "value": "test@example.com",
            "elementProps": {"tagName": "INPUT", "type": "email"},
            "url": "https://demo.todoapp.com/login"
        },
        {
            "id": "s4",
            "stepNumber": 4,
            "type": "type",
            "label": "Type into Password",
            "timestamp": 1700000003000,
            "selector": {"strategy": "aria-label", "value": "Password", "stability": "high"},
            "value": "********",
            "elementProps": {"tagName": "INPUT", "type": "password"},
            "url": "https://demo.todoapp.com/login"
        },
        {
            "id": "s5",
            "stepNumber": 5,
            "type": "validate",
            "label": "Assert Welcome message",
            "timestamp": 1700000004000,
            "selector": {"strategy": "role+text", "value": "heading:Welcome", "stability": "medium"},
            "value": "Welcome",
            "elementProps": {"tagName": "H1"},
            "url": "https://demo.todoapp.com/app"
        }
    ]
}


class TestHealthAndRoot:
    """Health check and root endpoint tests"""
    
    def test_health_endpoint(self):
        """GET /api/health returns {status: 'healthy'}"""
        response = requests.get(f"{API_URL}/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", f"Expected status='healthy', got {data}"
        assert "time" in data, "Expected 'time' field in response"
        print(f"✓ Health check passed: {data}")
    
    def test_root_endpoint(self):
        """GET /api/ returns service info"""
        response = requests.get(f"{API_URL}/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("service") == "TestCapture AI", f"Expected service='TestCapture AI', got {data}"
        assert data.get("status") == "ok", f"Expected status='ok', got {data}"
        print(f"✓ Root endpoint passed: {data}")


class TestGenerateScript:
    """Script generation endpoint tests"""
    
    def test_generate_script_playwright_with_emergent_key(self):
        """POST /api/generate-script with NO apiKey falls back to Emergent universal key"""
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": DEMO_SESSION,
            "framework": "playwright"
            # No apiKey - should use EMERGENT_LLM_KEY
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "code" in data, "Expected 'code' in response"
        assert "framework" in data, "Expected 'framework' in response"
        assert "model" in data, "Expected 'model' in response"
        assert "provider" in data, "Expected 'provider' in response"
        
        # Verify it used Claude (not offline-template) since EMERGENT_LLM_KEY is set
        assert data["model"] != "offline-template", f"Expected Claude model, got offline-template. Response: {data}"
        assert "claude" in data["model"].lower(), f"Expected Claude model name, got {data['model']}"
        
        # Verify code contains Playwright patterns
        code = data["code"]
        assert "test(" in code or "@playwright/test" in code, f"Expected Playwright code patterns, got: {code[:200]}"
        print(f"✓ Playwright generation with Emergent key passed. Model: {data['model']}")
    
    def test_generate_script_invalid_framework(self):
        """POST /api/generate-script with invalid framework returns 400"""
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": DEMO_SESSION,
            "framework": "invalid_framework"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Invalid framework returns 400")
    
    def test_generate_script_cypress(self):
        """POST /api/generate-script with framework=cypress produces cypress-style code"""
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": DEMO_SESSION,
            "framework": "cypress"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        code = data["code"]
        
        # Cypress code should contain 'describe' or 'cy.'
        has_describe = "describe" in code
        has_cy = "cy." in code
        assert has_describe or has_cy, f"Expected Cypress patterns (describe/cy.), got: {code[:300]}"
        print(f"✓ Cypress generation passed. Contains describe: {has_describe}, cy.: {has_cy}")
    
    def test_generate_script_selenium(self):
        """POST /api/generate-script with framework=selenium produces selenium-style code"""
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": DEMO_SESSION,
            "framework": "selenium"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        code = data["code"]
        
        # Selenium code should contain 'webdriver' or 'By.'
        has_webdriver = "webdriver" in code.lower()
        has_by = "By." in code
        assert has_webdriver or has_by, f"Expected Selenium patterns (webdriver/By.), got: {code[:300]}"
        print(f"✓ Selenium generation passed. Contains webdriver: {has_webdriver}, By.: {has_by}")
    
    def test_generate_script_karate(self):
        """POST /api/generate-script with framework=karate produces karate-style code"""
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": DEMO_SESSION,
            "framework": "karate"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        code = data["code"]
        
        # Karate code should contain 'Feature:' or 'Scenario:'
        has_feature = "Feature:" in code
        has_scenario = "Scenario:" in code
        assert has_feature or has_scenario, f"Expected Karate patterns (Feature:/Scenario:), got: {code[:300]}"
        print(f"✓ Karate generation passed. Contains Feature: {has_feature}, Scenario: {has_scenario}")
    
    def test_generate_script_password_redaction(self):
        """POST /api/generate-script with password step containing '********' should pass through"""
        # Session with password step already redacted
        session_with_password = {
            **DEMO_SESSION,
            "steps": [
                {
                    "id": "pwd1",
                    "stepNumber": 1,
                    "type": "type",
                    "label": "Type into Password",
                    "timestamp": 1700000000000,
                    "selector": {"strategy": "aria-label", "value": "Password", "stability": "high"},
                    "value": "********",  # Already redacted by client
                    "elementProps": {"tagName": "INPUT", "type": "password"},
                    "url": "https://demo.todoapp.com/login"
                }
            ]
        }
        
        response = requests.post(f"{API_URL}/generate-script", json={
            "session": session_with_password,
            "framework": "playwright"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify API accepts and returns code (doesn't crash)
        assert "code" in data, "Expected 'code' in response"
        code = data["code"]
        assert len(code) > 0, "Expected non-empty code"
        print(f"✓ Password redaction test passed. Code length: {len(code)}")


class TestSessionsCRUD:
    """Sessions CRUD endpoint tests"""
    
    @pytest.fixture
    def created_session_id(self):
        """Create a session and return its ID for testing"""
        session_data = {
            "name": f"TEST_Session_{uuid.uuid4().hex[:8]}",
            "project": "test",
            "startTime": 1700000000000,
            "targetOrigin": "https://test.example.com",
            "steps": [
                {
                    "id": "step1",
                    "stepNumber": 1,
                    "type": "navigate",
                    "label": "Navigate to test",
                    "timestamp": 1700000000000,
                    "selector": {"strategy": "url", "value": "https://test.example.com"},
                    "value": "https://test.example.com",
                    "elementProps": {}
                }
            ],
            "selectedFramework": "playwright"
        }
        response = requests.post(f"{API_URL}/sessions", json=session_data)
        assert response.status_code == 200, f"Failed to create session: {response.text}"
        data = response.json()
        session_id = data["id"]
        yield session_id
        # Cleanup
        requests.delete(f"{API_URL}/sessions/{session_id}")
    
    def test_create_session(self):
        """POST /api/sessions creates a session and returns it with id"""
        session_data = {
            "name": f"TEST_Create_{uuid.uuid4().hex[:8]}",
            "project": "test",
            "startTime": 1700000000000,
            "targetOrigin": "https://create.example.com",
            "steps": [],
            "selectedFramework": "playwright"
        }
        
        response = requests.post(f"{API_URL}/sessions", json=session_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Expected 'id' in response"
        assert data["name"] == session_data["name"], f"Expected name={session_data['name']}, got {data['name']}"
        assert data["project"] == session_data["project"]
        assert data["status"] == "saved"
        
        session_id = data["id"]
        print(f"✓ Session created with id: {session_id}")
        
        # Cleanup
        requests.delete(f"{API_URL}/sessions/{session_id}")
    
    def test_list_sessions(self, created_session_id):
        """GET /api/sessions lists sessions"""
        response = requests.get(f"{API_URL}/sessions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # Find our created session
        session_ids = [s["id"] for s in data]
        assert created_session_id in session_ids, f"Created session {created_session_id} not in list"
        print(f"✓ Sessions list returned {len(data)} sessions")
    
    def test_get_session_by_id(self, created_session_id):
        """GET /api/sessions/{id} returns the session"""
        response = requests.get(f"{API_URL}/sessions/{created_session_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["id"] == created_session_id, f"Expected id={created_session_id}, got {data['id']}"
        assert "name" in data
        assert "steps" in data
        print(f"✓ Get session by id passed: {data['name']}")
    
    def test_delete_session(self):
        """DELETE /api/sessions/{id} removes the session"""
        # First create a session
        session_data = {
            "name": f"TEST_Delete_{uuid.uuid4().hex[:8]}",
            "project": "test",
            "startTime": 1700000000000,
            "targetOrigin": "https://delete.example.com",
            "steps": [],
            "selectedFramework": "playwright"
        }
        create_response = requests.post(f"{API_URL}/sessions", json=session_data)
        assert create_response.status_code == 200
        session_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(f"{API_URL}/sessions/{session_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert data.get("deleted") == True, f"Expected deleted=True, got {data}"
        
        # Verify it's gone
        get_response = requests.get(f"{API_URL}/sessions/{session_id}")
        assert get_response.status_code == 404, f"Expected 404 after delete, got {get_response.status_code}"
        print(f"✓ Delete session passed")
    
    def test_get_nonexistent_session_returns_404(self):
        """GET /api/sessions/{id} for non-existent id returns 404"""
        fake_id = f"nonexistent-{uuid.uuid4().hex}"
        response = requests.get(f"{API_URL}/sessions/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent session returns 404")


class TestExtensionZip:
    """Extension zip download test"""
    
    def test_extension_zip_download(self):
        """GET /testcapture-extension.zip returns 200 with proper content"""
        response = requests.head(f"{BASE_URL}/testcapture-extension.zip")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "zip" in content_type or "octet-stream" in content_type, f"Expected zip content-type, got {content_type}"
        
        content_length = int(response.headers.get("content-length", 0))
        assert content_length > 5000, f"Expected >5KB, got {content_length} bytes"
        print(f"✓ Extension zip download passed. Size: {content_length} bytes, Type: {content_type}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
