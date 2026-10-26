import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { StateMessage } from '../components/ui';

export function NotFoundPage() {
  return <StateMessage icon={<Compass size={28} />} title="Page not found" message="The page you are looking for does not exist or has moved." action={<Link to="/" className="btn btn-primary">Back to overview</Link>} />;
}
