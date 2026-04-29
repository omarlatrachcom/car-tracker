import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

type CollapsibleCardProps = {
  title: string;
  initiallyCollapsed?: boolean;
  children: ReactNode;
};

export function CollapsibleCard({
  title,
  initiallyCollapsed = false,
  children,
}: CollapsibleCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initiallyCollapsed);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !isCollapsed }}
        onPress={() => setIsCollapsed((current) => !current)}
        style={styles.collapsibleHeader}
      >
        <Text style={[styles.sectionTitle, styles.collapsibleTitle]}>
          {title}
        </Text>
        <Text style={styles.collapseToggle}>{isCollapsed ? "+" : "-"}</Text>
      </Pressable>

      {isCollapsed ? null : (
        <View style={styles.collapsibleBody}>{children}</View>
      )}
    </View>
  );
}
