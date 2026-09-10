import { memo } from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  activeColor: string;
  inactiveColor: string;
  backgroundColor: string;
}

export const TabBar = memo(function TabBar({
  tabs,
  activeTab,
  onTabChange,
  activeColor,
  inactiveColor,
  backgroundColor,
}: TabBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => onTabChange(tab.id)}
          style={styles.tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.id }}
        >
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === tab.id ? activeColor : inactiveColor,
                fontWeight: activeTab === tab.id ? '700' : '500',
              },
            ]}
          >
            {tab.label}
          </Text>
          {activeTab === tab.id && (
            <View style={[styles.tabIndicator, { backgroundColor: activeColor }]} />
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    paddingHorizontal: 16,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 4,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  tabIndicator: {
    height: 2,
    width: '100%',
    borderRadius: 1,
  },
});
