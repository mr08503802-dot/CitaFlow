const express = require('express');
const { appointmentController, updateStatusSchema, walkInSchema } = require('../controllers/appointment.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/summary', appointmentController.getDashboardSummary);
router.get('/', appointmentController.list);
router.patch('/:id/status', validateBody(updateStatusSchema), appointmentController.updateStatus);
router.post('/walk-in', validateBody(walkInSchema), appointmentController.createWalkIn);

module.exports = router;
