declare module 'js-aruco2' {
  export const AR: {
    Detector: new (options: {
      dictionaryName: string;
      maxHammingDistance?: number;
    }) => {
      detect(frame: ImageData): {
        id: number;
        corners: { x: number; y: number }[];
        hammingDistance?: number;
      }[];
    };
    Dictionary: new (name: string) => { generateSVG(id: number): string };
  };
}

declare module 'js-aruco2/src/cv.js' {
  export const CV: import('./cards/types').CvApi;
}
