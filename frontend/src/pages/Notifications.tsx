import { useApp } from "@/contexts/AppContext";
import { Bell } from "lucide-react";
import { Button, Card, Empty, Title } from "@/components/common";

export function Notifications() {
  const { state, setState } = useApp();
  return (
    <>
      <Title
        eyebrow="IN-APP NOTICES"
        title="Signals worth a look."
        sub="These are local product notifications only. No email or SMS is sent."
      />
      <div className="page-tools">
        <span>{state.notifications.filter(n => !n.read).length} unread</span>
        <Button
          kind="outline"
          onClick={() =>
            setState({
              ...state,
              notifications: state.notifications.map(n => ({
                ...n,
                read: true,
              })),
            })
          }
        >
          Mark all as read
        </Button>
      </div>
      {state.notifications.length ? (
        <div className="notice-list">
          {state.notifications.map(n => (
            <Card key={n.id} className={`notice-card ${n.read ? "read" : ""}`}>
              <div className="notice-icon">
                <Bell size={18} />
              </div>
              <div>
                <div className="notice-title">
                  <b>{n.title}</b>
                  {!n.read && <span className="pill attention">New</span>}
                </div>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleDateString()}</small>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setState({
                    ...state,
                    notifications: state.notifications.map(x =>
                      x.id === n.id ? { ...x, read: !x.read } : x
                    ),
                  })
                }
              >
                {n.read ? "Mark unread" : "Mark read"}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="You’re all caught up"
            body="Relevant local notices will appear here when available."
          />
        </Card>
      )}
    </>
  );
}
