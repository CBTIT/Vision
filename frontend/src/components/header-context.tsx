import React, { createContext, useContext, useState } from "react";

interface HeaderContextValue {
  headerRight: React.ReactNode;
  setHeaderRight: (node: React.ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  headerRight: null,
  setHeaderRight: () => {},
});

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [headerRight, setHeaderRight] = useState<React.ReactNode>(null);
  return (
    <HeaderContext.Provider value={{ headerRight, setHeaderRight }}>
      {children}
    </HeaderContext.Provider>
  );
}

/** Use inside a page to inject content into the top-right of the header. */
export function useHeaderRight() {
  return useContext(HeaderContext).setHeaderRight;
}

/** Used by Layout to render the injected content. */
export function useHeaderRightContent() {
  return useContext(HeaderContext).headerRight;
}
