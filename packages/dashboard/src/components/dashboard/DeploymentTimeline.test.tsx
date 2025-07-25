import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeploymentTimeline } from './DeploymentTimeline';

describe('DeploymentTimeline', () => {
  it('renders deployment phases correctly', () => {
    render(<DeploymentTimeline deploymentId="test-123" projectId="test-project" />);
    
    // Check if all phases are rendered
    expect(screen.getByText('Build & Push')).toBeInTheDocument();
    expect(screen.getByText('Create Green Environment')).toBeInTheDocument();
    expect(screen.getByText('Health Checks')).toBeInTheDocument();
    expect(screen.getByText('Traffic Shifting')).toBeInTheDocument();
    expect(screen.getByText('Cleanup')).toBeInTheDocument();
  });

  it('shows blue and green environment cards', () => {
    render(<DeploymentTimeline />);
    
    expect(screen.getByText('Blue (Current)')).toBeInTheDocument();
    expect(screen.getByText('Green (New)')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('v1.2.4')).toBeInTheDocument();
  });

  it('displays traffic distribution correctly', () => {
    render(<DeploymentTimeline />);
    
    expect(screen.getByText('Traffic Distribution')).toBeInTheDocument();
    expect(screen.getByText('Incoming Traffic')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('simulates traffic shifting over time', async () => {
    render(<DeploymentTimeline />);
    
    // Initially green should have 75% traffic
    const greenTrafficElement = screen.getByText('Green (New)').closest('.space-y-4');
    expect(greenTrafficElement).toHaveTextContent('75%');

    // Wait for traffic shift simulation
    await waitFor(() => {
      expect(greenTrafficElement).toHaveTextContent('80%');
    }, { timeout: 3000 });
  });

  it('handles rollback action', async () => {
    render(<DeploymentTimeline />);
    
    const rollbackButton = screen.getByText('Rollback');
    expect(rollbackButton).not.toBeDisabled();
    
    fireEvent.click(rollbackButton);
    
    // Should show rolling back state
    expect(screen.getByText('Rolling back...')).toBeInTheDocument();
    
    // Wait for rollback to complete
    await waitFor(() => {
      expect(screen.getByText('Rollback')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('disables rollback when green traffic is 0', async () => {
    render(<DeploymentTimeline />);
    
    // Trigger rollback first
    const rollbackButton = screen.getByText('Rollback');
    fireEvent.click(rollbackButton);
    
    // Wait for rollback to complete
    await waitFor(() => {
      const button = screen.getByText('Rollback');
      expect(button).toBeDisabled();
    }, { timeout: 3000 });
  });

  it('shows correct phase icons based on status', () => {
    render(<DeploymentTimeline />);
    
    // Completed phases should have check icons
    const completedPhases = screen.getAllByRole('img', { hidden: true });
    expect(completedPhases.length).toBeGreaterThan(0);
  });

  it('displays deployment actions section', () => {
    render(<DeploymentTimeline />);
    
    expect(screen.getByText('Deployment Actions')).toBeInTheDocument();
    expect(screen.getByText('Deployment in progress')).toBeInTheDocument();
  });

  it('shows health status for environments', () => {
    render(<DeploymentTimeline />);
    
    // Both environments should show healthy instances
    expect(screen.getAllByText(/4\/4 healthy/)).toHaveLength(2);
  });

  it('updates completion message when deployment finishes', async () => {
    render(<DeploymentTimeline />);
    
    // Wait for deployment to complete (traffic reaches 100%)
    await waitFor(() => {
      expect(screen.getByText('Deployment completed successfully')).toBeInTheDocument();
    }, { timeout: 45000 }); // Longer timeout as it takes time to reach 100%
  });
});