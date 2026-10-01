const express = require('express');
const { staffController, staffSchema } = require('../controllers/staff.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/', staffController.list);
router.post('/', validateBody(staffSchema), staffController.create);
router.put('/:id', validateBody(staffSchema), staffController.update);
router.delete('/:id', staffController.delete);

module.exports = router;
