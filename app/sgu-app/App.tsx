import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { ChatSummary } from "./src/api/chats";
import { chatSocket } from "./src/api/chatSocket";
import { setSessionExpiredHandler } from "./src/api/client";
import { getMyUserId } from "./src/api/session";
import { getAccessToken } from "./src/storage/tokens";
import LoginScreen from "./src/screens/LoginScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatRoomScreen from "./src/screens/ChatRoomScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});

type Status = "loading" | "signedOut" | "signedIn";

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [myId, setMyId] = useState<number | null>(null);
  const [openChat, setOpenChat] = useState<ChatSummary | null>(null);
  const signedInRef = useRef(false);

  useEffect(() => {
    getAccessToken()
      .then((token) => setStatus(token ? "signedIn" : "signedOut"))
      .catch(() => setStatus("signedOut"));
  }, []);

  useEffect(() => {
    signedInRef.current = status === "signedIn";
  }, [status]);

  // Phiên hết hạn và không gia hạn được: về màn đăng nhập, chỉ báo một lần.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!signedInRef.current) return;
      signedInRef.current = false;
      setOpenChat(null);
      setMyId(null);
      setMustChangePassword(false);
      setStatus("signedOut");
      Alert.alert("Phiên đăng nhập đã hết hạn", "Vui lòng đăng nhập lại.");
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const ready = status === "signedIn" && !mustChangePassword;

  useEffect(() => {
    if (ready) {
      getMyUserId()
        .then(setMyId)
        .catch(() => setMyId(null));
      chatSocket.start();
    } else {
      chatSocket.stop();
    }
    if (status !== "loading") {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready, status]);

  if (status === "loading") {
    return null;
  }

  if (status === "signedOut") {
    return (
      <LoginScreen
        onSignedIn={(passwordChangeRequired) => {
          setMustChangePassword(passwordChangeRequired);
          setStatus("signedIn");
        }}
      />
    );
  }

  if (mustChangePassword) {
    const backToLogin = () => {
      setOpenChat(null);
      setMyId(null);
      setMustChangePassword(false);
      setStatus("signedOut");
    };
    return <ChangePasswordScreen onDone={backToLogin} onSignedOut={backToLogin} />;
  }

  if (openChat) {
    return <ChatRoomScreen chat={openChat} myId={myId} onBack={() => setOpenChat(null)} />;
  }

  return (
    <ChatListScreen
      onOpenChat={setOpenChat}
      onSignedOut={() => {
        setOpenChat(null);
        setMyId(null);
        setStatus("signedOut");
      }}
    />
  );
}
