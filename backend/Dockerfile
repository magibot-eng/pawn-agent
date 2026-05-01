FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-deploy.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements-deploy.txt

COPY app ./app
COPY alembic ./alembic
COPY pyproject.toml ./pyproject.toml
COPY .env.example ./.env.example

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
