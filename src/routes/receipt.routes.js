const express = require('express');
const { receiptController, issueReceiptSchema } = require('../controllers/receipt.controller');
const { authenticateToken, optionalAuth } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');

const router = express.Router();

// Allow client viewing via token OR authenticated viewing via Admin session
router.get('/:appointmentId/view', optionalAuth, receiptController.viewHtml);

router.use(authenticateToken);
router.get('/', receiptController.list);
router.post('/issue', validateBody(issueReceiptSchema), receiptController.issue);

module.exports = router;
