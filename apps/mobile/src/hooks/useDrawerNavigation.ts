import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

export function useDrawerNavigation() {
  const navigation = useNavigation();

  const closeDrawer = () => {
    navigation.dispatch(DrawerActions.closeDrawer());
  };

  return { closeDrawer };
}
