export type MainTabName = 'chats' | 'assistant' | 'settings';

export type MainTabParamList = Record<MainTabName, undefined>;

export type MainTabBarProps = {
  activeIndex: number;
  navigate: (name: MainTabName) => void;
};
