import React from 'react';
import { createRoot } from "react-dom/client";
import Footer from './Footer';

class PageNotFound extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            data: []
        };
    }

    handleResize(event) {
        this.setState({
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        });
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    render() {
        let footerHeight = this.state.windowWidth > 640 ? 60 : 32,
            footerTop = this.state.windowHeight - footerHeight,
            headerStyle = {
                width: this.state.windowWidth,
                transform: 'translate3d(0px,20px,0)',
                WebkitTransform: 'translate3d(0px,20px,0)'
            };

        return (
            <div>
                <div className='headers'>
                    <span className='header' style={headerStyle}>Page not found!</span>
                </div>
                <Footer top={footerTop} width={this.state.windowWidth} height={footerHeight} />
            </div>
        );
    }

};

const root = createRoot(document.getElementById('pageNotFound'));
root.render(<PageNotFound/>);
