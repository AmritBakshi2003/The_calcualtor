import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

describe('API Health Endpoints', () => {
  it('GET /api/health should return ok status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
  });

  it('GET /api/health/ready should return ready status', async () => {
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ready');
    expect(response.body).toHaveProperty('dependencies');
    expect(response.body.dependencies).toHaveProperty('mathCore', 'available');
  });
});

describe('API Calculate Endpoint', () => {
  it('POST /api/calculate should evaluate valid expression', async () => {
    const response = await request(app).post('/api/calculate').send({
      expression: '2 + 3 * 4',
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('result');
    expect(response.body.result).toBe(14);
  });

  it('POST /api/calculate should handle invalid expression', async () => {
    const response = await request(app).post('/api/calculate').send({
      expression: '2 + * 3',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('code');
  });

  it('POST /api/calculate should validate request body', async () => {
    const response = await request(app).post('/api/calculate').send({
      expression: '', // Invalid: empty string
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('POST /api/calculate should handle missing expression', async () => {
    const response = await request(app).post('/api/calculate').send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('POST /api/calculate should handle expression length limit', async () => {
    const longExpression = '1'.repeat(1001);
    const response = await request(app).post('/api/calculate').send({
      expression: longExpression,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('POST /api/calculate should handle angle mode', async () => {
    const response = await request(app).post('/api/calculate').send({
      expression: 'sin(90)',
      angleMode: 'deg',
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
});

describe('API Error Handling', () => {
  it('POST /api/calculate should handle malicious patterns', async () => {
    const response = await request(app).post('/api/calculate').send({
      expression: 'function() { return 1 }',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  it('GET /nonexistent should return 404', async () => {
    const response = await request(app).get('/nonexistent');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('code', 'NOT_FOUND');
  });
});
