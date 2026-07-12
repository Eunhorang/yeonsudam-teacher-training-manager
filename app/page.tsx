import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { TrainingManager } from "@/components/TrainingManager";
import { userKeyFromEmail } from "@/lib/user-key.server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const accountScope = user
    ? (await userKeyFromEmail(user.email)).slice(0, 20)
    : "";
  return (
    <TrainingManager
      account={user ? { displayName: user.displayName, accountScope } : null}
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
