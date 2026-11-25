import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MessageSquare, Phone, Radio, Settings, Users } from 'lucide-react-native';
import { MuzTalkColors } from '../theme/tokens';
import { ChatsListScreen } from '../screens/ChatsListScreen';
import { UpdatesScreen } from '../screens/UpdatesScreen';
import { CommunitiesScreen } from '../screens/CommunitiesScreen';
import { CallsScreen } from '../screens/CallsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ChatThreadScreen } from '../screens/ChatThreadScreen';

export type RootStackParamList = {
  MainTabs: undefined;
  ChatThread: { conversationId: string; title: string; peerUserId?: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: MuzTalkColors.primary,
        tabBarInactiveTintColor: MuzTalkColors.mutedText,
      }}
    >
      <Tab.Screen
        name="Chats"
        component={ChatsListScreen}
        options={{ tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Updates"
        component={UpdatesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Radio color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Communities"
        component={CommunitiesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Calls"
        component={CallsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Phone color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} />
    </Stack.Navigator>
  );
}
