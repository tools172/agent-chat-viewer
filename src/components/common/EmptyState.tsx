import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      {icon && (
        <div className="text-gray-300 mb-4">{icon}</div>
      )}
      <h3 className="text-lg font-medium text-gray-500 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 max-w-md mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};
