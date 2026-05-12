import { View, ActivityIndicator } from 'react-native';

export default function InitialScreen() {
  return (
    <View className="flex-1 justify-center items-center bg-brand-dark">
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
