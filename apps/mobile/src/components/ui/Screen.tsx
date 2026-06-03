import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/theme/useResponsive';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  safeTop?: boolean;
  style?: ViewStyle;
};

export function Screen({ children, scroll, padded = true, safeTop = false, style }: Props) {
  const { colors } = useTheme();
  const { horizontalPadding, contentMaxWidth } = useResponsive();

  const content = (
    <View
      style={[
        {
          flex: 1,
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: padded ? horizontalPadding : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={safeTop ? ['top'] : []}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
