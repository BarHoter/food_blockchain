// Tell TS that these globals exist
declare const React: typeof import("react");
declare const ReactDOM: typeof import("react-dom/client");
declare const ethers: typeof import("ethers");
declare const ReactRouterDOM: typeof import("react-router-dom");
declare const abi: any[];
interface Window {
  CONTRACT_ADDRESS?: string;
  PROVIDER_URL?: string;
  App?: any;
  Dashboard?: any;
  showToast?: (msg: string) => void;
}