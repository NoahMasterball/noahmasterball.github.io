"""Constants for Nanoleaf Essentials integration."""

DOMAIN = "nanoleaf_essentials"
CONF_HOST = "host"
CONF_TOKEN = "token"

# API Endpoints
API_BASE_URL = "http://{host}:16021/api/v1/{token}"
API_STATE_URL = API_BASE_URL + "/state"
API_EFFECTS_URL = API_BASE_URL + "/effects"
API_NEW_TOKEN_URL = "http://{host}:16021/api/v1/new"

# Default values
DEFAULT_NAME = "Nanoleaf Essentials"
DEFAULT_PORT = 16021
DEFAULT_SCAN_INTERVAL = 30
API_TIMEOUT = 30

# Error messages
ERROR_CANNOT_CONNECT = "cannot_connect"
ERROR_INVALID_AUTH = "invalid_auth"
ERROR_TIMEOUT = "timeout_connect"
ERROR_UNKNOWN = "unknown"