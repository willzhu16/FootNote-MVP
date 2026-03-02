import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export default function AppLayout() {
  const { isDark: dark } = useTheme();

  return (
    <Tabs
      initialRouteName="record"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: dark ? '#111' : '#fff',
          borderTopColor: dark ? '#222' : '#f0f0f0',
        },
        tabBarActiveTintColor: dark ? '#fff' : '#111',
        tabBarInactiveTintColor: dark ? '#555' : '#aaa',
      }}
    >
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mic-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="note/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  );
}
