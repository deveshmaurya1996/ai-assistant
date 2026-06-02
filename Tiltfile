# AI Assistant — Tilt orchestration
# Service ports from tilt_config.json (see scripts/ports.mjs ensure).
#
#   tilt up                          # default: core + db-setup + prisma-studio + api + ai + mobile
#   db-setup runs: prisma generate, migrate deploy, database build (before API/runtimes)
#   tilt up -- --services=core       # infra only
#   tilt up -- --services=full      # everything

load('./infra/tilt/infra.tilt', 'infra')
load('./infra/tilt/database.tilt', 'database_setup', 'database_tools')
load('./infra/tilt/monitoring.tilt', 'monitoring')
load('./infra/tilt/ai.tilt', 'ai_stack')
load('./infra/tilt/api.tilt', 'api')
load('./infra/tilt/services.tilt', 'ai_service', 'tool_runtime_service', 'skill_runtime_service', 'cognitive_runtime_service', 'ai_orchestrator_service')
load('./infra/tilt/apps.tilt', 'apps')

infra()
database_setup()
database_tools()
monitoring()
ai_stack()
api()
ai_service()
tool_runtime_service()
skill_runtime_service()
cognitive_runtime_service()
apps()
