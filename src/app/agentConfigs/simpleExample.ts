import { AgentConfig } from "@/app/types";
import { injectTransferTools } from "./utils";
import mall_helper from "./mall_customerServiceAgent/customerServiceRetail/mall_helper";


// add the transfer tool to point to downstreamAgents
const agents = injectTransferTools([mall_helper]);

export default agents;
