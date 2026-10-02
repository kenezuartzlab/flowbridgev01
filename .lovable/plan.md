# Mobile overlays and light-theme contrast

## Scope
1. Move every app window and selector into the shared top-level overlay layer so the footer, bottom navigation, assistant button, and page content always remain behind it.
2. Give overlays a consistent high stacking level, body scroll lock, safe-area spacing, accessible close labels, and scrollable content on short mobile screens.
3. Replace hardcoded dark-only surfaces in the token selector, bridge confirmation, bridge tracker, receipt, route, history, and settings windows with the existing theme-aware colors.
4. Correct light-theme button contrast, especially the bridge receipt/action buttons and the bridge countdown.
5. Change both header menus into a mobile-app drawer: nearly full-screen on phones and a wider side panel on larger screens, while keeping the same destinations and sign-in/sign-out behavior.
6. Verify token selection, bridge confirmation/tracker/receipt, and both menu implementations at 390px in dark and light themes; check that no fixed page element paints above an open window.

## Technical details
- Reuse `ModalPortal` for custom windows that currently render inside page stacking contexts.
- Standardize overlay surfaces on semantic tokens (`background`, `card`, `foreground`, `muted`, `primary`, `hairline`) rather than adding more dark-only overrides.
- Keep transaction, routing, wallet, and contract behavior unchanged.
- Add focused regression coverage where existing tests support these presentation states, then confirm the preview build is green.
