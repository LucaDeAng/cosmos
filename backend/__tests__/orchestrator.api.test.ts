import express from 'express';
import request from 'supertest';

// We'll mock the orchestrator handler to avoid LLM runtime in unit tests
jest.mock('../src/agents/orchestratorAgent', () => ({
  handleOrchestratorRequest: jest.fn(),
}));

const { handleOrchestratorRequest } = require('../src/agents/orchestratorAgent');

describe('POST /api/orchestrator', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.resetAllMocks();
    app = express();
    app.use(express.json());
    // dynamically import router so mocks apply
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const orchestratorRouter = require('../src/routes/orchestrator.routes').default;
    app.use('/api/orchestrator', orchestratorRouter);
  });

  it('returns 400 when message missing', async () => {
    const res = await request(app).post('/api/orchestrator').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'message is required');
  });

  it('calls handleOrchestratorRequest and returns content/metadata', async () => {
    (handleOrchestratorRequest as jest.Mock).mockResolvedValue({ content: 'ok', metadata: { routedTo: 'CLIENT_ASSESSMENT' } });

    const res = await request(app).post('/api/orchestrator').send({ message: 'Please help', context: { userId: 'u1' } });

    expect(res.status).toBe(200);
    expect(handleOrchestratorRequest).toHaveBeenCalledWith('Please help', { userId: 'u1' });
    expect(res.body).toEqual({ content: 'ok', metadata: { routedTo: 'CLIENT_ASSESSMENT' } });
  });

  it('returns 500 when orchestrator handler throws', async () => {
    (handleOrchestratorRequest as jest.Mock).mockRejectedValue(new Error('boom'));

    const res = await request(app).post('/api/orchestrator').send({ message: 'please' });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Orchestrator error');
    expect(res.body).toHaveProperty('details');
  });
});
