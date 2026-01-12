// User Routes
import express from 'express';
import { UserService } from '../services/user.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/profile', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const profile = await UserService.getUserProfile(userId);
    const stats = await UserService.getUserStats(userId);

    res.json({ ...profile, stats });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/users/profile
 * Update current user profile
 */
router.put('/profile', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const updates = req.body;

    const updatedUser = await UserService.updateUserProfile(userId, updates);
    res.json(updatedUser);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/users/company/:companyId
 * Get all users in a company (admin only)
 */
router.get(
  '/company/:companyId',
  authorize('admin', 'super_admin'),
  async (req: AuthRequest, res) => {
    try {
      const { companyId } = req.params;
      const requestingUserId = req.user!.userId;

      const users = await UserService.getCompanyUsers(companyId, requestingUserId);
      res.json(users);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * DELETE /api/users/:userId/deactivate
 * Deactivate a user (admin only)
 */
router.delete(
  '/:userId/deactivate',
  authorize('admin', 'super_admin'),
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user!.userId;

      const result = await UserService.deactivateUser(userId, requestingUserId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

export default router;
