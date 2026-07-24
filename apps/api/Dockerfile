FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && apt-get clean
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m -u 10001 appuser && mkdir -p /app/workspaces && chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]