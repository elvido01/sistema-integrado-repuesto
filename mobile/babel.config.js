module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Reanimated 4.x requiere el plugin de worklets (NO el de reanimated).
      // El plugin DEBE ser el ultimo en la lista.
      'react-native-worklets/plugin',
    ]
  };
};
