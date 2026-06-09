import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
}) => {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }[size];

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div
        className={`${sizeClass} animate-spin rounded-full border-2 border-gray-200 border-t-primary-600`}
      />
      {message && (
        <p className="mt-3 text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
};
