export interface ProgressBarProps {
  current: number;
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  const progressPercentage = (current / total) * 100;
  
  // Map percentage to Tailwind classes for smooth transitions
  const getWidthClass = (percentage: number): string => {
    if (percentage <= 10) return 'w-[10%]';
    if (percentage <= 20) return 'w-[20%]';
    if (percentage <= 30) return 'w-[30%]';
    if (percentage <= 40) return 'w-[40%]';
    if (percentage <= 50) return 'w-[50%]';
    if (percentage <= 60) return 'w-[60%]';
    if (percentage <= 70) return 'w-[70%]';
    if (percentage <= 80) return 'w-[80%]';
    if (percentage <= 90) return 'w-[90%]';
    return 'w-full';
  };

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2 overflow-hidden">
      <div
        className={`${getWidthClass(progressPercentage)} bg-primary h-2.5 rounded-full transition-all duration-300`}
      ></div>
    </div>
  );
}
