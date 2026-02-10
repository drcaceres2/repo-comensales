// global.d.ts
import 'react';

declare global {
  namespace JSX {
    // This extends the existing JSX namespace from React
    type Element = React.ReactElement;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
