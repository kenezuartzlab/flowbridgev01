// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlowBridgeRouterLens
 * @notice Read-only discovery and V2 quoting helpers for FlowBridgeRouterV4.
 * @dev This contract never holds funds and never executes swaps or bridges.
 *      It deliberately lives outside FlowBridgeRouterV4 to keep the execution
 *      contract under the EIP-170 deployed-code limit.
 */
interface IFlowBridgeRouterV4View {
    function routerCount() external view returns (uint256);
    function bridgeCount() external view returns (uint256);

    // Auto-generated getter for mapping(uint256 => RouterEntry) public routers.
    function routers(uint256 id)
        external
        view
        returns (
            address router,
            uint8 rtype,
            address wrappedNative,
            bool active,
            string memory name,
            string memory version
        );

    // Auto-generated getter for mapping(uint256 => BridgeEntry) public bridges.
    // Solidity omits the dynamic supportedTokens array from the getter.
    function bridges(uint256 id)
        external
        view
        returns (
            address bridge,
            bool active,
            string memory name,
            string memory destChainName,
            uint256 destChainId
        );

    function bridgeResourceId(uint256 bridgeId, address token) external view returns (bytes32);
    function bridgeTokenSupported(uint256 bridgeId, address token) external view returns (bool);
    function bridgeSupportsBotGas(uint256 bridgeId) external view returns (bool);
    function bridgeProxyExecutionEnabled(uint256 bridgeId) external view returns (bool);
}

interface IFlowBridgeV2QuoteRouter {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

contract FlowBridgeRouterLens {
    enum RouterType {
        V2,
        V3
    }

    IFlowBridgeRouterV4View public immutable flowRouter;

    error InvalidFlowRouter();
    error RouterIdOutOfRange();
    error BridgeIdOutOfRange();
    error PathTooShort();
    error InvalidPathToken();
    error IdenticalEndpoints();
    error DuplicatePathToken();

    constructor(address flowRouter_) {
        // V30.1B hardening: the lens target must be a deployed contract, not an
        // EOA or an undeployed address that would silently return empty reads.
        if (flowRouter_ == address(0) || flowRouter_.code.length == 0) revert InvalidFlowRouter();
        flowRouter = IFlowBridgeRouterV4View(flowRouter_);
    }


    function getActiveRouters()
        external
        view
        returns (
            uint256[] memory ids,
            string[] memory names,
            string[] memory versions,
            RouterType[] memory types_,
            address[] memory addrs
        )
    {
        uint256 total = flowRouter.routerCount();
        uint256 count;
        for (uint256 i; i < total; ++i) {
            (,,, bool active,,) = flowRouter.routers(i);
            if (active) ++count;
        }

        ids = new uint256[](count);
        names = new string[](count);
        versions = new string[](count);
        types_ = new RouterType[](count);
        addrs = new address[](count);

        uint256 index;
        for (uint256 i; i < total; ++i) {
            (address routerAddr, uint8 rtype,, bool active, string memory name, string memory version) =
                flowRouter.routers(i);
            if (!active) continue;

            ids[index] = i;
            names[index] = name;
            versions[index] = version;
            types_[index] = RouterType(rtype);
            addrs[index] = routerAddr;
            ++index;
        }
    }

    function getActiveBridges()
        external
        view
        returns (
            uint256[] memory ids,
            string[] memory names,
            string[] memory destChainNames,
            uint256[] memory destChainIds,
            address[] memory addrs
        )
    {
        uint256 total = flowRouter.bridgeCount();
        uint256 count;
        for (uint256 i; i < total; ++i) {
            (, bool active,,,) = flowRouter.bridges(i);
            if (active) ++count;
        }

        ids = new uint256[](count);
        names = new string[](count);
        destChainNames = new string[](count);
        destChainIds = new uint256[](count);
        addrs = new address[](count);

        uint256 index;
        for (uint256 i; i < total; ++i) {
            (address bridgeAddr, bool active, string memory name, string memory destName, uint256 destId) =
                flowRouter.bridges(i);
            if (!active) continue;

            ids[index] = i;
            names[index] = name;
            destChainNames[index] = destName;
            destChainIds[index] = destId;
            addrs[index] = bridgeAddr;
            ++index;
        }
    }

    function getBridgeRouteConfig(uint256 bridgeId, address token)
        external
        view
        returns (
            address gateway,
            uint256 destinationChainId,
            bytes32 resourceId,
            bool tokenSupported,
            bool botGasSupported,
            bool proxyExecutionEnabled,
            bool active
        )
    {
        if (bridgeId >= flowRouter.bridgeCount()) revert BridgeIdOutOfRange();
        (gateway, active,,, destinationChainId) = flowRouter.bridges(bridgeId);
        resourceId = flowRouter.bridgeResourceId(bridgeId, token);
        tokenSupported = flowRouter.bridgeTokenSupported(bridgeId, token);
        botGasSupported = flowRouter.bridgeSupportsBotGas(bridgeId);
        proxyExecutionEnabled = flowRouter.bridgeProxyExecutionEnabled(bridgeId);
    }

    function getBestV2Rate(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256 bestRouterId, uint256 bestAmountOut, uint256[] memory allAmountsOut)
    {
        _validateV2Path(path);
        uint256 total = flowRouter.routerCount();
        allAmountsOut = new uint256[](total);

        for (uint256 i; i < total; ++i) {
            (address routerAddr, uint8 rtype,, bool active,,) = flowRouter.routers(i);
            if (!active || rtype != uint8(RouterType.V2)) continue;

            try IFlowBridgeV2QuoteRouter(routerAddr).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                uint256 out = amounts[amounts.length - 1];
                allAmountsOut[i] = out;
                if (out > bestAmountOut) {
                    bestAmountOut = out;
                    bestRouterId = i;
                }
            } catch {
                allAmountsOut[i] = 0;
            }
        }
    }

    function getV2RatesPage(uint256 amountIn, address[] calldata path, uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory ids, uint256[] memory amountsOut)
    {
        _validateV2Path(path);
        uint256 total = flowRouter.routerCount();
        if (start >= total || count == 0) return (new uint256[](0), new uint256[](0));

        uint256 end = start + count;
        if (end > total) end = total;

        ids = new uint256[](end - start);
        amountsOut = new uint256[](end - start);
        uint256 index;

        for (uint256 i = start; i < end; ++i) {
            ids[index] = i;
            (address routerAddr, uint8 rtype,, bool active,,) = flowRouter.routers(i);
            if (active && rtype == uint8(RouterType.V2)) {
                try IFlowBridgeV2QuoteRouter(routerAddr).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                    amountsOut[index] = amounts[amounts.length - 1];
                } catch {
                    amountsOut[index] = 0;
                }
            }
            ++index;
        }
    }

    function getRouter(uint256 routerId)
        external
        view
        returns (
            address router,
            RouterType rtype,
            address wrappedNative,
            bool active,
            string memory name,
            string memory version
        )
    {
        if (routerId >= flowRouter.routerCount()) revert RouterIdOutOfRange();
        uint8 rawType;
        (router, rawType, wrappedNative, active, name, version) = flowRouter.routers(routerId);
        rtype = RouterType(rawType);
    }

    function _validateV2Path(address[] calldata path) internal pure {
        if (path.length < 2) revert PathTooShort();
        if (path[0] == address(0) || path[path.length - 1] == address(0)) revert InvalidPathToken();
        if (path[0] == path[path.length - 1]) revert IdenticalEndpoints();

        for (uint256 i = 1; i < path.length; ++i) {
            if (path[i] == address(0)) revert InvalidPathToken();
            if (path[i] == path[i - 1]) revert DuplicatePathToken();
        }
    }
}
