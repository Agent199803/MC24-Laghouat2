import React, { useState } from "react";
import { View, StyleSheet, PanResponder } from "react-native";

export default function App() {
  const [player, setPlayer] = useState({ x: 150, y: 300 });

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (evt, gestureState) => {
      setPlayer({
        x: player.x + gestureState.dx,
        y: player.y + gestureState.dy
      });
    }
  });

  return (
    <View style={styles.field}>
      {/* اللاعب */}
      <View
        {...panResponder.panHandlers}
        style={[
          styles.player,
          { left: player.x, top: player.y }
        ]}
      />

      {/* الكرة */}
      <View style={styles.ball} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    backgroundColor: "#1f7a3d"
  },
  player: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "red"
  },
  ball: {
    position: "absolute",
    width: 25,
    height: 25,
    borderRadius: 12.5,
    backgroundColor: "white",
    left: 180,
    top: 300
  }
});
