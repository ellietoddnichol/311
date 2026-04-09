import React from 'react';
import { WorkflowRightDrawer } from './WorkflowRightDrawer';

interface PricingRulesDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Shell for advanced pricing / company-default context — pass the same controls you already use in setup. */
export function PricingRulesDrawer({ open, onClose, children }: PricingRulesDrawerProps) {
  return (
    <WorkflowRightDrawer
      open={open}
      title="Advanced pricing & conditions"
      subtitle="Project-level burden, O&P, adders, and multipliers — same fields as Setup Section 3."
      widthClassName="max-w-[min(100vw-1rem,36rem)]"
      onClose={onClose}
    >
      <div className="p-4">{children}</div>
    </WorkflowRightDrawer>
  );
}
