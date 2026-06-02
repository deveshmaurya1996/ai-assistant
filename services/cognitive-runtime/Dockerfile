FROM python:3.12-slim
WORKDIR /app
COPY services/ai-orchestrator/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/ai-orchestrator .
EXPOSE 3013
ENV AI_ORCHESTRATOR_PORT=3013
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3013"]
