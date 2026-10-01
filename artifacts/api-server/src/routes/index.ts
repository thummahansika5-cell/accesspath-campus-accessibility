import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accessPathRouter from "./accesspath";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accessPathRouter);

export default router;
