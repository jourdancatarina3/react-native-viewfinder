import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ZoomableImage } from 'react-native-viewfinder';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.root}>
        <ZoomableImage source="https://picsum.photos/id/1015/2000/1333" />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
