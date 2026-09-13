import { Redirect, type Href } from 'expo-router';

/** Legacy hub — Progresso lives on the tab. Keep the route so old links work. */
export default function ProgressHubRedirect() {
  return <Redirect href={'/(tabs)/progress' as Href} />;
}
