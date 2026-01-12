// Main Application Entry Point
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import fileRoutes from './routes/file.routes';
import assessmentRoutes from './routes/assessment.routes';
import companyRoutes from './routes/company.routes';
import orchestratorRoutes from './routes/orchestrator.routes';
import portfolioRoutes from './routes/portfolio.routes';
import portfolioStreamRoutes from './routes/portfolio-stream.routes';
import roadmapRoutes from './routes/roadmap.routes';
import budgetRoutes from './routes/budget.routes';
import strategyRoutes from './routes/strategy.routes';
import flowRoutes from './routes/flow.routes';
import ragRoutes from './routes/ragRoutes';
import learningRoutes from './routes/learning.routes';
import externalKnowledgeRoutes from './routes/external-knowledge.routes';
import prioritizationRoutes from './routes/prioritization.routes';
import enhancedIngestionRoutes from './routes/enhanced-ingestion.routes';
import alertsNotificationsRoutes from './routes/alerts-notifications.routes';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================

// Security headers
app.use(helmet());

// CORS - Allow multiple origins for development
const allowedOrigins = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://192.168.1.95:3001',
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    console.warn(`CORS: Rejected origin ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 hours cache for preflight requests
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================
// ROUTES
// ============================================================

// Health check (enhanced for production monitoring)
app.get('/health', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  });
});

// Readiness check (for Kubernetes/Railway)
app.get('/ready', (req: Request, res: Response) => {
  res.json({ ready: true, timestamp: new Date().toISOString() });
});

// API routes
console.log('Route types:', {
  auth: Object.prototype.toString.call(authRoutes),
  users: Object.prototype.toString.call(userRoutes),
  files: Object.prototype.toString.call(fileRoutes),
  assessment: Object.prototype.toString.call(assessmentRoutes),
  company: Object.prototype.toString.call(companyRoutes),
  orchestrator: Object.prototype.toString.call(orchestratorRoutes),
  portfolio: Object.prototype.toString.call(portfolioRoutes),
  roadmap: Object.prototype.toString.call(roadmapRoutes),
  budget: Object.prototype.toString.call(budgetRoutes),
  strategy: Object.prototype.toString.call(strategyRoutes),
  flow: Object.prototype.toString.call(flowRoutes),
  rag: Object.prototype.toString.call(ragRoutes),
  learning: Object.prototype.toString.call(learningRoutes),
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/portfolio', portfolioStreamRoutes); // 🚀 FREE Streaming endpoints
app.use('/api/roadmap', roadmapRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/flow', flowRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/learning', learningRoutes); // 🎓 Continuous Learning API
app.use('/api/external-knowledge', externalKnowledgeRoutes); // 🌐 External Knowledge API
app.use('/api/prioritization', prioritizationRoutes); // 🎯 Portfolio Prioritization API
app.use('/api/ingestion', enhancedIngestionRoutes); // 🚀 Enhanced Ingestion API
app.use('/api', alertsNotificationsRoutes); // 🚨 Alerts and Notifications API

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API: http://localhost:${PORT}`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
});

export default app;
