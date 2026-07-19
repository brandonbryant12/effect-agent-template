// The graph transition tables live in @repo/contracts (beside the status
// schemas) because the web machines are generated from them. Re-exported
// here so backend code keeps one import path for domain rules.
export {
  allowedGraphNodeTransitions,
  allowedGraphRunTransitions,
} from "@repo/contracts";
