import { injectTransferTools } from "../../utils";
import mall_helper from "./mall_helper";


const agents = injectTransferTools([
  mall_helper
]);

export default agents;