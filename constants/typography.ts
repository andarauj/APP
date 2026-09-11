// Changes' type scale. Headings are heavy (ExtraBold 800), large, tightly
// leaded and near-black; hero numbers on the ruler/age steps are very
// large ExtraBold.
//
// fontWeight is kept roughly aligned with the family but React Native honours
// the weight baked into `fontFamily`, not the `fontWeight` string, when a
// custom family is set.
export const Typography = {
  h1: { fontFamily: 'Inter-ExtraBold', fontSize: 30, fontWeight: '800', lineHeight: 34 },
  h2: { fontFamily: 'Inter-ExtraBold', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  h3: { fontFamily: 'Inter-Bold', fontSize: 20, fontWeight: '700', lineHeight: 25 },
  h4: { fontFamily: 'Inter-SemiBold', fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontFamily: 'Inter-Regular', fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySmall: { fontFamily: 'Inter-Regular', fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontFamily: 'Inter-Regular', fontSize: 12, fontWeight: '400', lineHeight: 16 },
  label: { fontFamily: 'Inter-SemiBold', fontSize: 13, fontWeight: '600', lineHeight: 16 },
  button: { fontFamily: 'Inter-Bold', fontSize: 17, fontWeight: '700', lineHeight: 22 },
  number: { fontFamily: 'Inter-ExtraBold', fontSize: 30, fontWeight: '800', lineHeight: 34 },
  numberLarge: { fontFamily: 'Inter-ExtraBold', fontSize: 52, fontWeight: '800', lineHeight: 56 },
};
