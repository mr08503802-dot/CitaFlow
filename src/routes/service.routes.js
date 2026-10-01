const express = require('express');
const { serviceController, serviceSchema } = require('../controllers/service.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/', serviceController.list);
router.post('/', validateBody(serviceSchema), serviceController.create);
router.put('/:id', validateBody(serviceSchema), serviceController.update);
router.delete('/:id', serviceController.delete);

module.exports = router;
