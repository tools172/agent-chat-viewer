import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            组件加载失败
          </h3>
          <p className="text-xs text-gray-500 mb-3 max-w-sm">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
